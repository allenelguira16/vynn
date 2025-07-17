import { Outlet } from "vynn-router";

import { ButtonPageList } from "~/components/ButtonPageList";

export default function AppLayout() {
  return (
    <div class="p-2 flex flex-col container m-auto">
      <ButtonPageList />

      <Outlet />
    </div>
  );
}
