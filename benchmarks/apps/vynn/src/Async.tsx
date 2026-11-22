import { Await, $computed, $state } from "vynn";

export default function Async() {
  const userId = $state(1);
  const user = $computed(async () => {
    const id = userId.value;
    await Promise.resolve();
    return { id, name: `User ${id}` };
  });

  return (
    <main>
      <h1>Async memo</h1>
      <button type="button" onClick={() => userId.value++}>
        Next user
      </button>
      <Await fallback={<p>Loading...</p>} suspense>
        <p>{user.value.name}</p>
      </Await>
    </main>
  );
}
