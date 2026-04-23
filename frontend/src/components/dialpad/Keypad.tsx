const KEYS: Array<{ digit: string; sub?: string }> = [
  { digit: '1', sub: '' },
  { digit: '2', sub: 'ABC' },
  { digit: '3', sub: 'DEF' },
  { digit: '4', sub: 'GHI' },
  { digit: '5', sub: 'JKL' },
  { digit: '6', sub: 'MNO' },
  { digit: '7', sub: 'PQRS' },
  { digit: '8', sub: 'TUV' },
  { digit: '9', sub: 'WXYZ' },
  { digit: '*' },
  { digit: '0', sub: '+' },
  { digit: '#' },
];

export function Keypad({
  onPress,
  compact = false,
}: {
  onPress: (digit: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={'grid grid-cols-3 ' + (compact ? 'gap-2' : 'gap-3')}>
      {KEYS.map(({ digit, sub }) => (
        <button
          key={digit}
          type="button"
          onClick={() => onPress(digit)}
          className={'dialpad-key ' + (compact ? 'py-2 text-xl' : '')}
        >
          <span>{digit}</span>
          {sub && (
            <span className="text-[10px] font-semibold tracking-widest text-ink-500">
              {sub}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
