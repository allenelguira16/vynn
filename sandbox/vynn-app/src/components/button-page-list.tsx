import { isActiveRoute, navigate } from "vynn-router";

import { Template } from "./template";

export const ButtonPageList = () => {
  return (
    <Template title="Pages">
      <ul class="flex flex-col gap-2">
        <li>
          <button
            class="btn"
            onClick={() => navigate("/")}
            disabled={isActiveRoute("/")}
          >
            All
          </button>
        </li>
        <li>
          <button
            class="btn"
            onClick={() => navigate("/lazy")}
            disabled={isActiveRoute("/lazy")}
          >
            Lazy
          </button>
        </li>
        <li>
          <button
            class="btn"
            onClick={() => navigate("/forms")}
            disabled={isActiveRoute("/forms")}
          >
            Forms
          </button>
        </li>
        <li>
          <button
            class="btn"
            onClick={() => navigate("/contexts")}
            disabled={isActiveRoute("/contexts")}
          >
            Contexts
          </button>
        </li>
        <li>
          <button
            class="btn"
            onClick={() => navigate("/dropdown-list")}
            disabled={isActiveRoute("/dropdown-list")}
          >
            Dropdown Lists
          </button>
        </li>
        <li>
          <button
            class="btn"
            onClick={() => navigate("/non-async-suspense")}
            disabled={isActiveRoute("/non-async-suspense")}
          >
            Non Async Suspense
          </button>
        </li>
        <li>
          <button
            class="btn"
            onClick={() => navigate("/stacked-suspense")}
            disabled={isActiveRoute("/stacked-suspense")}
          >
            Stacked Suspense
          </button>
        </li>
        <li>
          <button
            class="btn"
            onClick={() => navigate("/poke-dex")}
            disabled={isActiveRoute("/poke-dex")}
          >
            PokeDex List
          </button>
        </li>
        <li>
          <button
            class="btn"
            onClick={() => navigate("/poke-dex-await")}
            disabled={isActiveRoute("/poke-dex-await")}
          >
            PokeDex List with Await
          </button>
        </li>
      </ul>
    </Template>
  );
};
