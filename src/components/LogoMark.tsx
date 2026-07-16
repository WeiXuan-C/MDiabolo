interface LogoMarkProps {
  className?: string;
  title?: string;
}

export function LogoMark({ className, title = 'MDiabolo' }: LogoMarkProps) {
  return (
    <img className={className} src="/icon.png" alt={title} />
  );
}
