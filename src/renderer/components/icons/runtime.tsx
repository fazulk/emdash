import * as React from 'react';
import type { CSSProperties, SVGProps } from 'react';

type BaseIcon = React.ComponentType<SVGProps<SVGSVGElement>>;

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  title?: string;
};

export type IconComponent = React.ForwardRefExoticComponent<
  IconProps & React.RefAttributes<SVGSVGElement>
>;

export function withIcon(Icon: BaseIcon): IconComponent {
  const WrappedIcon = React.forwardRef<SVGSVGElement, IconProps>(
    ({ size, width, height, style, ...props }, ref) => {
      const mergedStyle: CSSProperties = {
        flexShrink: 0,
        ...style,
      };

      return (
        <Icon
          ref={ref}
          {...props}
          width={width ?? size}
          height={height ?? size}
          style={mergedStyle}
        />
      );
    }
  );

  WrappedIcon.displayName = `WithIcon(${Icon.displayName ?? Icon.name ?? 'Icon'})`;

  return WrappedIcon;
}
