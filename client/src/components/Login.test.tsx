import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from './Login';

describe('Login', () => {
  it('renders sign-in heading and description', () => {
    render(<Login onLogin={() => {}} isLoading={false} />);
    expect(screen.getByText('Sign in to get started')).toBeInTheDocument();
    expect(screen.getByText(/Sign in with your Google account/)).toBeInTheDocument();
  });

  it('renders a Google sign-in button', () => {
    render(<Login onLogin={() => {}} isLoading={false} />);
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  });

  it('calls onLogin when button is clicked', async () => {
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} isLoading={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('shows Redirecting... when isLoading is true', () => {
    render(<Login onLogin={() => {}} isLoading={true} />);
    expect(screen.getByRole('button', { name: 'Redirecting...' })).toBeInTheDocument();
  });

  it('disables button when isLoading is true', () => {
    render(<Login onLogin={() => {}} isLoading={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
