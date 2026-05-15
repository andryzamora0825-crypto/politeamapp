"use client";

interface StickerPickerProps {
  onSelect: (stickerId: string) => void;
  onClose: () => void;
}

const stickerCategories = [
  {
    name: "Caras",
    stickers: ["😀","😂","🤣","😍","🥰","😎","🤩","😜","🤗","🥳","😤","😭","🤯","🫠","😈","💀","🤡","👻","🥶","🤑"]
  },
  {
    name: "Gestos",
    stickers: ["👍","👎","👏","🙌","🤝","✌️","🤞","💪","👊","🫶","🙏","💅","🫡","🤙","👋","✋","🖐️","🤚","🤟","🤘"]
  },
  {
    name: "Corazones",
    stickers: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","💕","💞","💓","💗","💖","💘","💝","♥️","🫀"]
  },
  {
    name: "Animales",
    stickers: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🦄","🐝","🦋","🐢","🐙"]
  },
  {
    name: "Comida",
    stickers: ["🍕","🍔","🌮","🍟","🌭","🍿","🧁","🍩","🍪","🎂","🍰","🍫","🍬","🍭","🍦","🍧","🥤","☕","🧋","🍺"]
  },
  {
    name: "Objetos",
    stickers: ["⚽","🏀","🎮","🎯","🎪","🎭","🎨","🎬","🎤","🎧","🎸","🎹","🎺","🥁","🏆","🥇","🎖️","🏅","🎗️","🎁"]
  }
];

export function StickerPicker({ onSelect, onClose }: StickerPickerProps) {
  return (
    <div className="ig-sticker-picker">
      <div className="ig-sticker-header">
        <span>Stickers</span>
        <button onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="ig-sticker-body">
        {stickerCategories.map(cat => (
          <div key={cat.name} className="ig-sticker-cat">
            <div className="ig-sticker-cat-name">{cat.name}</div>
            <div className="ig-sticker-grid">
              {cat.stickers.map(s => (
                <button key={s} className="ig-sticker-item" onClick={() => onSelect(s)}>{s}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
