import { isActiveRoute, navigate } from "vynn-router";

import { Template } from "./Template";

export const ButtonPageList = () => {
  return (
    <Template title="Pages">
      <ul class="flex flex-col gap-2">
        <li>
          <button onClick={() => navigate("/")} disabled={isActiveRoute("/")}>
            All
          </button>
        </li>
        <li>
          <button onClick={() => navigate("/lazy")} disabled={isActiveRoute("/lazy")}>
            Lazy
          </button>
        </li>
        <li>
          <button onClick={() => navigate("/forms")} disabled={isActiveRoute("/forms")}>
            Forms
          </button>
        </li>
        <li>
          <button onClick={() => navigate("/contexts")} disabled={isActiveRoute("/contexts")}>
            Contexts
          </button>
        </li>
        <li>
          <button
            onClick={() => navigate("/dropdown-list")}
            disabled={isActiveRoute("/dropdown-list")}
          >
            Dropdown Lists
          </button>
        </li>
        <li>
          <button
            onClick={() => navigate("/non-async-suspense")}
            disabled={isActiveRoute("/non-async-suspense")}
          >
            Non Async Suspense
          </button>
        </li>
        <li>
          <button
            onClick={() => navigate("/stacked-suspense")}
            disabled={isActiveRoute("/stacked-suspense")}
          >
            Stacked Suspense
          </button>
        </li>
        <li>
          <button onClick={() => navigate("/poke-dex")} disabled={isActiveRoute("/poke-dex")}>
            PokeDex List
          </button>
        </li>
        <li>
          <button
            onClick={() => navigate("/poke-dex-suspense")}
            disabled={isActiveRoute("/poke-dex-suspense")}
          >
            PokeDex List with Suspense
          </button>
        </li>
      </ul>
    </Template>
  );
};
