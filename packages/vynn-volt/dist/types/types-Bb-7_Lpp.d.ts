import { PropsWithChildren, JSX } from 'vynn';

type AppProps = PropsWithChildren<{
    assets: JSX.Element;
    scripts: JSX.Element;
}>;

export type { AppProps as A };
