interface TrueFalseOptionsProps {
    selectedAnswer: string;
    onSelect: (answer: string) => void;
    name: string;
    className?: string;
}
export function TrueFalseOptions({ selectedAnswer, onSelect, name, className = '' }: TrueFalseOptionsProps) {
    const options = [
        { value: 'True', label: 'True' },
        { value: 'False', label: 'False' }
    ];
    return (<div className={`space-y-3 ${className}`}>
      {options.map((option) => (<label key={option.value} className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedAnswer === option.value
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'}`}>
          <input type="radio" name={name} value={option.value} checked={selectedAnswer === option.value} onChange={() => onSelect(option.value)} className="mt-1"/>
          <div>
            <span className="font-medium text-gray-900">{option.label}</span>
          </div>
        </label>))}
    </div>);
}
export default TrueFalseOptions;
