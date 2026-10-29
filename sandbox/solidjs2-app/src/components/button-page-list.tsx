import { For } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";

import { Template } from "./template";

const pages = [
  { path: "/", label: "All" },
  { path: "/lazy", label: "Lazy" },
  { path: "/forms", label: "Forms" },
  { path: "/contexts", label: "Contexts" },
  { path: "/dropdown-list", label: "Dropdown Lists" },
  { path: "/non-async-suspense", label: "Non Async Suspense" },
  { path: "/stacked-suspense", label: "Stacked Suspense" },
  { path: "/poke-dex", label: "PokeDex List" },
  { path: "/poke-dex-await", label: "PokeDex List with Await" },
];

export const ButtonPageList = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Template title="Pages">
      <ul class="flex flex-col gap-2">
        <For each={pages}>
          {(page) => (
            <li>
              <button
                class="btn"
                onClick={() => navigate(page.path)}
                disabled={location.pathname === page.path}
              >
                {page.label}
              </button>
            </li>
          )}
        </For>
      </ul>
    </Template>
  );
};
