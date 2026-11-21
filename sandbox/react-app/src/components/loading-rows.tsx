export function LoadingRows() {
  return (
    <>
      {Array.from({ length: 20 }, (_, index) => index + 1).map((number) => (
        <tr key={number}>
          <td colSpan={3} className="h-6 text-center">
            {number === 10 ? "loading..." : "\u00a0"}
          </td>
        </tr>
      ))}
    </>
  );
}
