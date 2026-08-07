import { Component, type ErrorInfo, type ReactNode } from 'react';

interface SectionErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
  message?: string;
}

interface SectionErrorBoundaryState {
  failed: boolean;
}

export default class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  state: SectionErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): SectionErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Error loading application section:', error, info.componentStack);
  }

  componentDidUpdate(previousProps: SectionErrorBoundaryProps): void {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div role="alert" className="card flex flex-col items-center gap-3 py-10 text-center">
        <p className="font-semibold text-slate-900 dark:text-slate-100">
          {this.props.message ?? 'No se pudo cargar esta sección.'}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Puede haber una versión nueva disponible o haberse interrumpido la descarga.
        </p>
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          Recargar aplicación
        </button>
      </div>
    );
  }
}
