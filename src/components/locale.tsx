"use client";

import { createContext, useContext } from "react";
import { translate } from "@/lib/i18n";

const LocaleContext = createContext("en");

export function LocaleProvider({ locale, children }: { locale: string; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale === "id" ? "id" : "en"}>{children}</LocaleContext.Provider>;
}

export function useT() {
  const locale = useContext(LocaleContext);
  return (value: string) => translate(locale, value);
}

export function Tx({ text }: { text: string }) {
  const t = useT();
  return <>{t(text)}</>;
}

export function TInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const t = useT();
  return <input {...props} placeholder={typeof props.placeholder === "string" ? t(props.placeholder) : props.placeholder} />;
}

export function TTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const t = useT();
  return <textarea {...props} placeholder={typeof props.placeholder === "string" ? t(props.placeholder) : props.placeholder} />;
}
