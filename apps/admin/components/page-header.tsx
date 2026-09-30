export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-navy sm:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-start gap-2">{children}</div> : null}
    </div>
  );
}
