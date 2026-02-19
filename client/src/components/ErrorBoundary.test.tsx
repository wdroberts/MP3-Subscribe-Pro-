import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from './ErrorBoundary';

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test error');
  return <div>Normal content</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Suppress React error boundary console.error
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  it('renders error message when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('renders a Try Again button when error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
  });

  it('resets error state when Try Again is clicked', async () => {
    // Use a flag that we can toggle to stop the throw on re-render
    let shouldThrow = true;
    function ConditionalThrower() {
      if (shouldThrow) throw new Error('Test error');
      return <div>Recovered content</div>;
    }

    render(
      <ErrorBoundary>
        <ConditionalThrower />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Stop throwing before clicking Try Again
    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(screen.getByText('Recovered content')).toBeInTheDocument();
  });
});
