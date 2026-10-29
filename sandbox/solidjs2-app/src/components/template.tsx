import { JSX } from "@solidjs/web";

export const Template = (props: { title: string; children: JSX.Element }) => {
  return (
    <div class="p-2 w-full">
      <h1 class="font-bold text-2xl mb-2">{props.title}</h1>
      {props.children}
    </div>
  );
};
