import type { ReactNode } from "react";

export function Template(props: { title: string; children: ReactNode; card?: boolean }) {
  if (props.card) {
    return (
      <div className="card shadow-sm w-full">
        <div className="card-body">
          <h2 className="card-title text-xl">{props.title}</h2>
          {props.children}
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 w-full">
      <h1 className="font-bold text-2xl mb-2">{props.title}</h1>
      {props.children}
    </div>
  );
}
