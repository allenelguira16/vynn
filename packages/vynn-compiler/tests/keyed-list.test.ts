import { describe, expect, it } from "vitest";

import { transformVynnOxc } from "../src/index.ts";

describe("JSX keyed list reconciliation", () => {
  it("extracts the root key and makes the row item reactive", () => {
    const code = transformVynnOxc(
      `function Page() {
        return users.map((user, index) => (
          <UserCard
            key={user.id}
            name={user.name}
            position={index}
          />
        ));
      }`,
      "keyed-component-list.tsx",
    );

    expect(code).toContain("user => user.id");
    expect(code).toContain("user.value.name");
    expect(code).toContain("index.value");
    expect(code).not.toContain("get key()");
  });

  it("does not serialize a host row key as a DOM attribute", () => {
    const code = transformVynnOxc(
      `function Page() {
        return users.map(user => (
          <li key={user.id} class="user-row">{user.name}</li>
        ));
      }`,
      "keyed-host-list.tsx",
    );

    expect(code).toContain("user => user.id");
    expect(code).toContain("user.value.name");
    expect(code).not.toContain("key=");
    expect(code).not.toContain('"key"');
  });

  it("does not emit a key as a host attribute outside a list", () => {
    const code = transformVynnOxc(
      `const view = () => <li key="metadata">Page</li>;`,
      "standalone-host-key.tsx",
    );

    expect(code).not.toContain('"key"');
    expect(code).not.toContain("key=");
  });

  it("supports local named callbacks without changing the original callback", () => {
    const code = transformVynnOxc(
      `function renderUser(user, index) {
        return <UserCard key={user.id} name={user.name} position={index} />;
      }

      function Page() {
        return users.map(renderUser);
      }`,
      "keyed-named-callback.tsx",
    );

    expect(code).toContain("user => user.id");
    expect(code).toContain("user.value.name");
    expect(code).toContain("index.value");
  });

  it("rejects keys on conditional roots instead of guessing row identity", () => {
    expect(() =>
      transformVynnOxc(
        `function Page() {
          return users.map(user =>
            user.active
              ? <ActiveUser key={user.id} />
              : <InactiveUser key={user.id} />
          );
        }`,
        "keyed-conditional-root.tsx",
      ),
    ).toThrow("single JSX element directly returned");
  });

  it("keeps reference identity when no root key is provided", () => {
    const code = transformVynnOxc(
      `function Page() {
        return users.map(user => <UserCard name={user.name} />);
      }`,
      "unkeyed-list.tsx",
    );

    expect(code).not.toContain("user.value.name");
    expect(code).not.toContain("user => user.id");
  });

  it("exports a render callback and key selector for imported keyed lists", () => {
    const source = transformVynnOxc(
      `export function renderPokemon(pokemon, index) {
        return <Row key={pokemon.name} name={pokemon.name} index={index} />;
      }`,
      "components/render-pokemon.tsx",
    );

    expect(source).toContain("__vynn_for_renderPokemon");
    expect(source).toContain("__vynn_key_renderPokemon");
    expect(source).toContain("return pokemon.name");
    expect(source).toContain("pokemon.value.name");
    expect(source).toContain("index.value");
  });

  it("imports the render and key companions for aliased callbacks", () => {
    const code = transformVynnOxc(
      `import { renderPokemon as renderRow } from "./render-pokemon";

      export function PokemonList() {
        return <>{pokeDex.results.map(renderRow)}</>;
      }`,
      "components/pokemon-list.tsx",
    );

    expect(code).toContain("__vynn_for_renderPokemon as");
    expect(code).toContain("__vynn_key_renderPokemon as");
    expect(code).toContain("_renderRowFor");
    expect(code).toContain("_renderRowKey");
    expect(code).toContain("_renderRowFor, _renderRowKey, true");
  });

  it("supports default-imported named render callbacks", () => {
    const source = transformVynnOxc(
      `export default function renderPokemon(pokemon) {
        return <Row key={pokemon.name} name={pokemon.name} />;
      }`,
      "components/default-render-pokemon.tsx",
    );
    const consumer = transformVynnOxc(
      `import renderPokemon from "./default-render-pokemon";

      export function PokemonList() {
        return <>{pokeDex.results.map(renderPokemon)}</>;
      }`,
      "components/default-pokemon-list.tsx",
    );

    expect(source).toContain("__vynn_for_default");
    expect(source).toContain("__vynn_key_default");
    expect(consumer).toContain("__vynn_for_default as");
    expect(consumer).toContain("__vynn_key_default as");
  });

  it("uses companion properties for namespace-imported callbacks", () => {
    const code = transformVynnOxc(
      `import * as PokemonRows from "./render-pokemon";

      export function PokemonList() {
        return <>{pokeDex.results.map(PokemonRows.renderPokemon)}</>;
      }`,
      "components/pokemon-list-namespace.tsx",
    );

    expect(code).toContain("PokemonRows.__vynn_for_renderPokemon");
    expect(code).toContain("PokemonRows.__vynn_key_renderPokemon");
  });

  it("supports imported component functions as map callbacks", () => {
    const source = transformVynnOxc(
      `export function FunctionImportedSomewhere({ name }) {
        return <Row name={name} />;
      }`,
      "components/imported-component-callback.tsx",
    );
    const consumer = transformVynnOxc(
      `import { FunctionImportedSomewhere } from "./imported-component-callback";

      export function PokemonList() {
        return <>{pokeDex.results.map(FunctionImportedSomewhere)}</>;
      }`,
      "components/component-callback-list.tsx",
    );

    expect(source).toContain("__vynn_for_FunctionImportedSomewhere");
    expect(source).toContain("__vynn_key_FunctionImportedSomewhere");
    expect(consumer).toContain("__vynn_for_FunctionImportedSomewhere as");
    expect(consumer).toContain("__vynn_key_FunctionImportedSomewhere as");
    expect(consumer).toContain(
      "_FunctionImportedSomewhereFor, _FunctionImportedSomewhereKey, true",
    );
  });

  it("exports an undefined key companion for callbacks without a key", () => {
    const source = transformVynnOxc(
      `export function renderPokemon(pokemon) {
        return <Row name={pokemon.name} />;
      }`,
      "components/render-unkeyed-pokemon.tsx",
    );
    const consumer = transformVynnOxc(
      `import { renderPokemon } from "./render-unkeyed-pokemon";
      export function PokemonList() {
        return <>{pokeDex.results.map(renderPokemon)}</>;
      }`,
      "components/unkeyed-pokemon-list.tsx",
    );

    expect(source).toContain("__vynn_key_renderPokemon");
    expect(source).toContain("= void 0");
    expect(consumer).toContain("__vynn_key_renderPokemon as");
    expect(consumer).toContain("_renderPokemonKey, true");
  });

  it("supports destructured parameters in imported keyed callbacks", () => {
    const source = transformVynnOxc(
      `export function renderPokemon({ name, url }, index) {
        return <Row key={name} name={name} url={url} index={index} />;
      }`,
      "components/render-destructured-pokemon.tsx",
    );
    const consumer = transformVynnOxc(
      `import { renderPokemon } from "./render-destructured-pokemon";

      export function PokemonList() {
        return <>{pokeDex.results.map(renderPokemon)}</>;
      }`,
      "components/destructured-pokemon-list.tsx",
    );

    expect(source).toContain("__vynn_for_renderPokemon");
    expect(source).toContain("__vynn_key_renderPokemon");
    expect(source).toContain(".value.name");
    expect(source).toContain(".value.url");
    expect(source).toContain("return props.name");
    expect(consumer).toContain("__vynn_key_renderPokemon as");
    expect(consumer).toContain("_renderPokemonFor, _renderPokemonKey, true");
  });

  it("supports destructured parameters in inline keyed callbacks", () => {
    const code = transformVynnOxc(
      `function PokemonList() {
        return pokeDex.results.map(({ name, url }, index) => (
          <Row key={name} name={name} url={url} index={index} />
        ));
      }`,
      "components/inline-destructured-pokemon-list.tsx",
    );

    expect(code).toContain(".value.name");
    expect(code).toContain(".value.url");
    expect(code).toContain("return props.name");
  });
});
