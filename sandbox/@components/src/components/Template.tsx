import { JSX } from "vynn";

export const Template = ({ title, children }: { title: string; children: () => JSX.Element }) => {
  return (
    <div class="p-2 w-full">
      <h1 class="font-bold text-2xl mb-2">{title}</h1>
      {children()}
    </div>
  );
};
