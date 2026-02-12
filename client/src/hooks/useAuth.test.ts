import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock window.location
const originalLocation = window.location;
beforeAll(() => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...originalLocation, href: '' },
  });
});
afterAll(() => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: originalLocation,
  });
});

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    // Default: no verification call
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  });

  it('initializes with no user when nothing is stored', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('initializes with stored user', () => {
    const storedUser = { id: '1', email: 'a@b.com', name: 'Test', picture: '' };
    localStorageMock.setItem('mp3_auth_user', JSON.stringify(storedUser));
    localStorageMock.setItem('mp3_auth_token', 'token-123');

    const { result } = renderHook(() => useAuth());
    expect(result.current.user).toEqual(storedUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('login redirects to Google OAuth URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ url: 'https://accounts.google.com/o/oauth2/auth?...' }),
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/google/url');
    expect(window.location.href).toBe('https://accounts.google.com/o/oauth2/auth?...');
  });

  it('login handles errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login();
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('handleCallback stores user and token on success', async () => {
    // No token in localStorage, so verify won't fire on mount
    const { result } = renderHook(() => useAuth());

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        user: { id: '1', email: 'a@b.com', name: 'Test', picture: '' },
        accessToken: 'new-token',
      }),
    });

    await act(async () => {
      await result.current.handleCallback('auth-code-123');
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith('mp3_auth_token', 'new-token');
    expect(result.current.user).toEqual(
      expect.objectContaining({ email: 'a@b.com' }),
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('handleCallback sets isLoading to false on non-ok response', async () => {
    const { result } = renderHook(() => useAuth());

    mockFetch.mockResolvedValueOnce({ ok: false });

    try {
      await act(async () => {
        await result.current.handleCallback('bad-code');
      });
    } catch {
      // handleCallback throws 'Authentication failed'
    }

    expect(result.current.isLoading).toBe(false);
  });

  it('logout clears stored data and sets user to null', () => {
    const storedUser = { id: '1', email: 'a@b.com', name: 'Test', picture: '' };
    localStorageMock.setItem('mp3_auth_user', JSON.stringify(storedUser));
    localStorageMock.setItem('mp3_auth_token', 'token-123');

    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.logout();
    });

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('mp3_auth_token');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('mp3_auth_user');
    expect(result.current.user).toBeNull();
  });

  it('getToken returns token from localStorage', () => {
    localStorageMock.setItem('mp3_auth_token', 'my-token');

    const { result } = renderHook(() => useAuth());
    expect(result.current.getToken()).toBe('my-token');
  });

  it('getToken returns null when no token is stored', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.getToken()).toBeNull();
  });

  it('clears user when verify returns non-ok on mount', async () => {
    localStorageMock.setItem('mp3_auth_token', 'expired-token');
    localStorageMock.setItem('mp3_auth_user', JSON.stringify({ id: '1', email: 'a@b.com', name: 'Test', picture: '' }));

    mockFetch.mockResolvedValueOnce({ ok: false });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.user).toBeNull();
    });

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('mp3_auth_token');
  });

  it('keeps user when verify fetch fails (network error)', async () => {
    const storedUser = { id: '1', email: 'a@b.com', name: 'Test', picture: '' };
    localStorageMock.setItem('mp3_auth_token', 'some-token');
    localStorageMock.setItem('mp3_auth_user', JSON.stringify(storedUser));

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAuth());

    // User should still be set after the network error
    await waitFor(() => {
      expect(result.current.user).toEqual(storedUser);
    });
  });
});
