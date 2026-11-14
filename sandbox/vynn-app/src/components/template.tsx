import { JSX } from "vynn";

export const Template = (props: { title: string; children: JSX.Element; card?: boolean }) => {
  return (
    <>
      {props.card && (
        <div class="card shadow-sm w-full">
          <div class="card-body">
            <h1 class="card-title text-2xl">{props.title}</h1>
            {props.children}
          </div>
        </div>
      )}
      {!props.card && (
        <div class="w-full">
          <h1 class="font-bold text-2xl mb-2">{props.title}</h1>
          {props.children}
        </div>
      )}
    </>
  );
};
