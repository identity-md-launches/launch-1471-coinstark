import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function Icon({
  name,
  size = 20,
}: {
  name:
    | "arrow"
    | "external"
    | "wallet"
    | "copy"
    | "check"
    | "refresh"
    | "close"
    | "shield"
    | "chevron"
    | "info";
  size?: number;
}) {
  const paths = {
    arrow: (
      <>
        <path d="M4 12h15M13 5l7 7-7 7" />
      </>
    ),
    external: (
      <>
        <path d="M14 4h6v6M20 4 9 15M10 5H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-5" />
      </>
    ),
    wallet: (
      <>
        <path d="M20 8V5H6a3 3 0 0 0 0 6h14v9H6a3 3 0 0 1-3-3V8M20 11h-5v5h5" />
        <path d="M16 13.5h1" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M15 8V4H4v11h4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    refresh: (
      <>
        <path d="M20 10a8 8 0 1 0-2 8M20 4v6h-6" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="40"
      height="40"
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="18" fill="currentColor" />
      <path
        d="M44 16H27L15 28v20h17l17-17H32v9h-7V31l7-7h12z"
        fill="var(--ink)"
      />
      <path d="m49 6 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="var(--ink)" />
    </svg>
  );
}

export function Modal({
  title,
  children,
  onClose,
  locked = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  locked?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = dialog.current!;
    el.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el.close();
      document.body.style.overflow = previousOverflow;
      before?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!locked) close.current();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]',
          ),
        ];
        const first = controls[0],
          last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="modal-heading">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          disabled={locked}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function ExternalLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      className={`external-link ${className}`}
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
      <Icon name="external" size={16} />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
