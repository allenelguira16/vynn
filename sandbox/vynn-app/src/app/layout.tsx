import { Portal, PropsWithChildren } from "vynn";

import { ButtonPageList } from "../components/button-page-list";
import { Template } from "../components/template";
import { name } from "../utils";

export default function RootPage(props: PropsWithChildren) {
  let el!: HTMLDivElement;

  return (
    <>
      <div class="flex">
        <nav class="flex h-screen w-1/8">
          <ButtonPageList />
        </nav>
        <div class="flex-1 overflow-auto h-screen p-4" ref={el}>
          {props.children}
        </div>
      </div>
      <Portal mount={el}>
        <Template title="Portal">{name.firstName}</Template>
      </Portal>
    </>
  );
}
