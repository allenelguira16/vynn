import { PropsWithChildren } from "vynn";

import { ButtonPageList } from "~/components/ButtonPageList";

export default function AppLayout({ children }: PropsWithChildren) {
  return (
    <div class="p-2 flex flex-col container m-auto">
      <ButtonPageList />

      {children()}
    </div>
  );
}
