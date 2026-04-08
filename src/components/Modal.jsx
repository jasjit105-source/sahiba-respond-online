export default function Modal({ title, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl w-[90%] max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-lg">&times;</button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
