import { Component } from "preact";
import type { ComponentChildren } from "preact";

type CatchProps = {
  children: ComponentChildren;
  fallback: (error: Error, reset: () => void) => ComponentChildren;
};

type CatchState = {
  error: Error | null;
};

export class Catch extends Component<CatchProps, CatchState> {
  state: CatchState = { error: null };

  static getDerivedStateFromError(error: unknown): CatchState {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  reset = () => {
    this.setState({ error: null });
  };

  render(props: CatchProps, state: CatchState) {
    if (state.error) {
      return props.fallback(state.error, this.reset);
    }

    return props.children;
  }
}
