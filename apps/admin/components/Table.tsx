import type { ReactNode } from "react";

export default function Table({
  head,
  children,
}: {
  head: string[];
  children: ReactNode;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted">
          {head.map((h, i) => (
            <th key={i} className="pb-2 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
