import Contexts from "./contexts/page";
import Dropdowns from "./dropdown-list/page";
import Forms from "./forms/page";
import NonAsyncSuspense from "./non-async-suspense/page";
import PokeDex from "./poke-dex/page";
import PokeDexSuspense from "./poke-dex-suspense/page";
import StackedSuspense from "./stacked-suspense/page";

export default function Index() {
  return (
    <>
      <Forms />
      <Contexts />
      <Dropdowns />
      <NonAsyncSuspense />
      <StackedSuspense />
      <PokeDex />
      <PokeDexSuspense />
    </>
  );
}
