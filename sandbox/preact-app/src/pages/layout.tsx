import { createPortal } from "preact/compat";
import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

import { ButtonPageList } from "../components/button-page-list";
import { Template } from "../components/template";
import { useName } from "../context/name-context";

export default function LayoutPage(props: { children: ComponentChildren }) {
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const { name } = useName();

  return (
    <>
      <div class="flex">
        <nav class="flex h-screen w-1/8">
          <ButtonPageList />
        </nav>
        <div class="flex-1 overflow-auto h-screen p-4">
          <div class="container mx-auto">
            <div class="flex flex-col gap-8" ref={setPortalTarget}>
              {props.children}
            </div>
          </div>
        </div>
      </div>
      {portalTarget
        ? createPortal(<Template title="Portal">{name.firstName}</Template>, portalTarget)
        : null}
    </>
  );
}
