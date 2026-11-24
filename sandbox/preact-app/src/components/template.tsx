import type { ComponentChildren } from "preact";

export function Template(props: {
  title: string;
  children: ComponentChildren;
  card?: boolean;
}) {
  return (
    <>
      {props.card ? (
        <div class="card shadow-sm w-full">
          <div class="card-body">
            <h1 class="card-title text-xl">{props.title}</h1>
            {props.children}
          </div>
        </div>
      ) : (
        <div class="w-full">
          <h1 class="font-bold text-2xl mb-2">{props.title}</h1>
          {props.children}
        </div>
      )}
    </>
  );
}
