"use client";
import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="card p-5">
          <p className="text-sm text-[color:var(--bad)]">
            {this.props.label ? `${this.props.label}: ` : ""}Failed to render
          </p>
          <p className="mt-1 text-xs text-[color:var(--text-faint)]">
            {this.state.error?.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
