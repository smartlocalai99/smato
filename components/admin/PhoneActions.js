import { telHref, whatsappHref } from "@/lib/phone";

const linkClass =
  "inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border border-line transition-colors";

// Call + WhatsApp buttons for a phone number. Renders nothing when the
// number can't be dialled, so a half-typed or empty field shows no dead links.
export default function PhoneActions({ number, name }) {
  const tel = telHref(number);
  const whatsapp = whatsappHref(number);
  if (!tel) return null;
  const who = name ? `${name} (${number})` : number;

  return (
    <span className="inline-flex flex-none items-center gap-1.5">
      <a
        href={tel}
        aria-label={`Call ${who}`}
        title="Call"
        className={`${linkClass} text-teal hover:border-teal`}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8z" />
        </svg>
      </a>
      <a
        href={whatsapp}
        target="_blank"
        rel="noreferrer"
        aria-label={`WhatsApp ${who}`}
        title="WhatsApp"
        className={`${linkClass} text-green hover:border-green`}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.25-.12-1.45-.72-1.68-.8-.22-.08-.39-.12-.55.12-.16.25-.63.8-.77.96-.14.17-.28.19-.53.06a6.7 6.7 0 0 1-3.3-2.88c-.25-.43.25-.4.71-1.33.08-.16.04-.3-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3 2.74 2.74 0 0 0-.86 2.04 4.76 4.76 0 0 0 1 2.53 10.9 10.9 0 0 0 4.18 3.7c1.56.67 2.17.73 2.95.61.47-.07 1.45-.59 1.66-1.17.2-.57.2-1.07.14-1.17-.06-.1-.22-.16-.47-.28z" />
        </svg>
      </a>
    </span>
  );
}
