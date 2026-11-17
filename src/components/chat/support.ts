/**
 * "Report an issue" goes to the maintainer's WhatsApp with a pre-filled message.
 * Set NEXT_PUBLIC_SUPPORT_WHATSAPP in .env.local (international format, digits only, e.g. 2376XXXXXXXX).
 */
const NUMBER = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");

export function whatsappLink(message: string): string {
  return `https://wa.me/${NUMBER}?text=${encodeURIComponent(message)}`;
}

export function reportAnswerLink(question: string, answer: string): string {
  const shortAnswer = answer.replace(/\s+/g, " ").slice(0, 400);
  return whatsappLink(
    `Hi! I want to report a problem with an AskICT answer.\n\nMy question: ${question}\n\nAskICT answered: ${shortAnswer}${answer.length > 400 ? "…" : ""}\n\nWhat is wrong: `,
  );
}

export const generalReportLink = () => whatsappLink("Hi! I want to report an issue with AskICT: ");
