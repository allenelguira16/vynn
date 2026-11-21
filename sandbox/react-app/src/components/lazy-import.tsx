export default function LazyImport() {
  return (
    <div className="p-2">
      <div>Lazy imported component</div>
      <div>This module is loaded only when its boundary is rendered.</div>
    </div>
  );
}
