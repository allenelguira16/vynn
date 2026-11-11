import ComponentError from "./component-error/page";
import Contexts from "./context/page";
import Dropdowns from "./dropdown-list/page";
import Forms from "./forms/page";
import Lazy from "./lazy/page";
import NonAsyncSuspense from "./non-async-suspense/page";
import PokeDexAwait from "./poke-dex-await/page";
import PokeDex from "./poke-dex/page";
import StackedSuspense from "./stacked-suspense/page";

export default function RootPage() {
  return (
    <>
      <Lazy />
      <Forms />
      <Contexts />
      <Dropdowns />
      <ComponentError />
      <NonAsyncSuspense />
      <PokeDex />
      <PokeDexAwait />
      <StackedSuspense />
    </>
  );
}
