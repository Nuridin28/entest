import { useState } from 'react';
import { authApi, auth } from '@shared/api/api';
import { t, setLanguage, getLanguage, type Language } from '@shared/utils/i18n';
interface AuthPageProps {
    onLoginSuccess: () => void;
}
function AuthPage({ onLoginSuccess }: AuthPageProps) {
    const [activeTab, setActiveTab] = useState('login');
    const [selectedLanguage, setSelectedLanguage] = useState<Language>(getLanguage());
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const handleLanguageChange = (lang: Language) => {
        setLanguage(lang);
        setSelectedLanguage(lang);
    };
    const resetFormFields = () => {
        setEmail('');
        setPassword('');
        setFullName('');
    };
    const handleTabChange = (tab: 'login' | 'register') => {
        setActiveTab(tab);
        resetFormFields();
        setMessage('');
        setIsError(false);
    };
    async function handleLogin(event: React.FormEvent) {
        event.preventDefault();
        setMessage('');
        setIsError(false);
        try {
            const data = await authApi.login(email, password);
            auth.setTokens(data.access_token, data.token_type);
            setMessage(t('loginSuccess'));
            setTimeout(() => {
                onLoginSuccess();
            }, 1000);
        }
        catch (error: any) {
            setIsError(true);
            setMessage(error.message || t('loginError'));
        }
    }
    async function handleRegister(event: React.FormEvent) {
        event.preventDefault();
        setMessage('');
        setIsError(false);
        try {
            await authApi.register(fullName, email, password);
            setMessage(t('registerSuccess'));
            resetFormFields();
            setTimeout(() => {
                handleTabChange('login');
            }, 2000);
        }
        catch (error: any) {
            setIsError(true);
            setMessage(error.message || t('registerError'));
        }
    }
    return (<div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex justify-center mb-6">
          <img src="/kbtu-logo.svg" alt="KBTU Logo" className="h-20"/>
        </div>

        <div className="flex justify-center mb-6 space-x-2">
          {(['kz', 'ru', 'en'] as Language[]).map(lang => (<button key={lang} className={`px-4 py-2 rounded-full flex items-center space-x-2 transition-colors ${selectedLanguage === lang ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`} onClick={() => handleLanguageChange(lang)}>
              <img src={`/${lang}-flag.svg`} alt={`${lang} Flag`} className="h-4 w-4"/>
              <span>{lang.toUpperCase()}</span>
            </button>))}
        </div>

        <div className="flex bg-gray-200 rounded-full mb-6 p-1">
          <button className={`flex-1 py-2 rounded-full text-center transition-colors ${activeTab === 'login' ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-300'}`} onClick={() => handleTabChange('login')}>
            {t('login')}
          </button>
          <button className={`flex-1 py-2 rounded-full text-center transition-colors ${activeTab === 'register' ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-300'}`} onClick={() => handleTabChange('register')}>
            {t('register')}
          </button>
        </div>

        {message && (<div className={`mb-4 p-3 rounded-md text-center ${isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {message}
          </div>)}

        {activeTab === 'login' && (<form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-gray-700 text-sm font-bold mb-2">
                {t('emailLabel')}
              </label>
              <input type="email" id="email" className="shadow appearance-none border rounded-full w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" placeholder={t('emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} required/>
            </div>
            <div>
              <label htmlFor="password" className="block text-gray-700 text-sm font-bold mb-2">
                {t('passwordLabel')}
              </label>
              <input type="password" id="password" className="shadow appearance-none border rounded-full w-full py-3 px-4 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline" placeholder={t('passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"/>
            </div>
            <div className="flex items-center justify-center pt-2">
              <button type="submit" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full focus:outline-none focus:shadow-outline w-full">
                {t('loginButton')}
              </button>
            </div>
            
          </form>)}

        {activeTab === 'register' && (<form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-gray-700 text-sm font-bold mb-2">
                {t('fullNameLabel')}
              </label>
              <input type="text" id="fullName" className="shadow appearance-none border rounded-full w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" placeholder={t('fullNamePlaceholder')} value={fullName} onChange={(e) => setFullName(e.target.value)} required/>
            </div>
            <div>
              <label htmlFor="regEmail" className="block text-gray-700 text-sm font-bold mb-2">
                {t('emailLabel')}
              </label>
              <input type="email" id="regEmail" className="shadow appearance-none border rounded-full w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" placeholder={t('emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} required/>
            </div>
            <div>
              <label htmlFor="regPassword" className="block text-gray-700 text-sm font-bold mb-2">
                {t('passwordLabel')}
              </label>
              <input type="password" id="regPassword" className="shadow appearance-none border rounded-full w-full py-3 px-4 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline" placeholder={t('passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password"/>
            </div>
            <div className="flex items-center justify-center pt-2">
              <button type="submit" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full focus:outline-none focus:shadow-outline w-full">
                {t('registerButton')}
              </button>
            </div>
          </form>)}
      </div>
    </div>);
}
export default AuthPage;
