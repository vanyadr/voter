import { AudioLines } from "lucide-react";

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <AudioLines size={22} strokeWidth={2.5} />
      </span>
      <span>
        voter<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
