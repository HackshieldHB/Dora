"use client";

export function ChoiceButtons({ choices, className = "decision-actions" }: { choices: { value: string; label: string; secondary?: boolean }[]; className?: string }) {
  function choose(event: React.SyntheticEvent<HTMLButtonElement>) {
    const field = event.currentTarget.form?.querySelector('input[type="hidden"][name="decision"]');
    if (field instanceof HTMLInputElement) field.value = event.currentTarget.getAttribute("data-decision") || "";
  }
  return (
    <div className={className}>
      <input type="hidden" name="decision" defaultValue="" />
      {choices.map((choice) => (
        <button key={choice.value} className={choice.secondary ? "btn secondary" : "btn"} type="submit" data-decision={choice.value} onPointerDown={choose} onClick={choose}>
          {choice.label}
        </button>
      ))}
    </div>
  );
}
