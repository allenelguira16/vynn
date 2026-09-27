import "./main.css";

import { createApp } from "vynn/client";
import { Forms } from "./pages/forms";
import { Dropdowns } from "./pages/dropdown-list";
import { NonAsyncSuspense } from "./pages/non-async-suspense";
import { PokeDex } from "./pages/poke-dex";
import { PokeDexSuspense } from "./pages/poke-dex-suspense";
import { Contexts } from "./pages/context";
import { Lazy } from "./pages/lazy";

function App() {
  return (
    <>
      <Contexts />
      <Dropdowns />
      <Forms />
      <Lazy />
      <NonAsyncSuspense />
      <PokeDex />
      <PokeDexSuspense />
    </>
  );
}

createApp(App).mount("#app");
