import { AlertTriangle, RotateCcw } from 'lucide-react';
import React from 'react';
import { BrandLogo } from '../../lib/brand';
import { Button } from '../ui/Button';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected rendering error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] bg-[var(--bg)] flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full rounded-[16px] border border-[var(--border)] bg-[var(--bg)] p-6 space-y-5 shadow-soft">
            <div className="flex justify-center">
              <BrandLogo size="lg" />
            </div>
            <div className="rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3.5 flex items-start gap-2.5 text-left">
              <AlertTriangle className="h-4 w-4 text-[var(--danger)] shrink-0 mt-0.5" />
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold text-[var(--danger)]">
                  Screen failed to load
                </p>
                <p className="text-xs text-[var(--text)] break-words">
                  {this.state.errorMessage}. Reload the page to recover.
                </p>
              </div>
            </div>
            <div className="flex justify-center">
              <Button
                type="button"
                variant="primary"
                onClick={() => window.location.reload()}
              >
                <RotateCcw className="h-4 w-4" />
                <span>Reload page</span>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
