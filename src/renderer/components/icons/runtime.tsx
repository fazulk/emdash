import type { ComponentType, CSSProperties, SVGProps } from 'react';

type BaseIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  title?: string;
};

export type IconComponent = ComponentType<IconProps>;

export function withIcon(Icon: BaseIcon): IconComponent {
  const WrappedIcon: IconComponent = ({ size, width, height, style, ...props }) => {
    const mergedStyle: CSSProperties = {
      flexShrink: 0,
      ...style,
    };

    return (
      <Icon
        {...props}
        width={width ?? size}
        height={height ?? size}
        style={mergedStyle}
      />
    );
  };

  WrappedIcon.displayName = `WithIcon(${Icon.displayName ?? Icon.name ?? 'Icon'})`;

  return WrappedIcon;
}
