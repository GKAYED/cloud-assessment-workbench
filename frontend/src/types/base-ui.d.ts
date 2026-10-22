declare module '@base-ui/react/button' {
  import * as React from 'react';

  export type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
  };

  export const Button: React.ForwardRefExoticComponent<
    Props & React.RefAttributes<HTMLButtonElement>
  >;
}
