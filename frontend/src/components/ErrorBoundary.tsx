import { Component, ErrorInfo, ReactNode } from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';
import '../styles/ErrorBoundary.css';

interface Props extends WithTranslation {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    // 刷新页面
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h1>{this.props.t('errorBoundary.title')}</h1>
            <p>{this.props.t('errorBoundary.description')}</p>
            {this.state.error && (
              <div className="error-details">
                <strong>{this.props.t('errorBoundary.errorMessage')}</strong>
                <pre>{this.state.error.toString()}</pre>
                {this.state.errorInfo && (
                  <>
                    <strong>
                      {this.props.t('errorBoundary.componentStack')}
                    </strong>
                    <pre>{this.state.errorInfo.componentStack}</pre>
                  </>
                )}
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="error-boundary-button"
            >
              {this.props.t('errorBoundary.refresh')}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default withTranslation()(ErrorBoundary);
