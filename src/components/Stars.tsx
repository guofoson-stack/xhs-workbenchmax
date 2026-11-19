"use client";

export default function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange?.(i)}
          className={`text-base leading-none ${i <= value ? "text-amber-400" : "text-gray-300"} ${onChange ? "cursor-pointer" : "cursor-default"}`}
          title={`${i} 分`}
        >
          ★
        </button>
      ))}
    </span>
  );
}
