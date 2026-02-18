interface AnswerOptionsProps {
    options: Record<string, string>;
    selectedAnswer: string;
    onSelect: (key: string) => void;
    name: string;
    className?: string;
}
export function AnswerOptions({ options, selectedAnswer, onSelect, name, className = '' }: AnswerOptionsProps) {
    return (<div className={`space-y-3 ${className}`}>
      {Object.entries(options).map(([key, value]) => (<label key={key} className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedAnswer === key
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'}`}>
          <input type="radio" name={name} value={key} checked={selectedAnswer === key} onChange={() => onSelect(key)} className="mt-1"/>
          <div>
            <span className="font-medium text-gray-900">{key}{value ? '.' : ''}</span>
            {value && <span className="text-gray-700 ml-2">{value}</span>}
          </div>
        </label>))}
    </div>);
}
export default AnswerOptions;
