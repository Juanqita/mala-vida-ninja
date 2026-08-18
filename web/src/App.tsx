import { Route, Router, Switch } from 'wouter';
import { GameProvider } from '@/context/GameContext';
import AuthPage from '@/pages/AuthPage';
import GamePage from '@/pages/GamePage';
import ResultPage from '@/pages/ResultPage';
import NotFound from '@/pages/NotFound';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function App() {
  return (
    <GameProvider>
      <Router base={base}>
        <Switch>
          <Route path="/" component={AuthPage} />
          <Route path="/game" component={GamePage} />
          <Route path="/result" component={ResultPage} />
          <Route component={NotFound} />
        </Switch>
      </Router>
    </GameProvider>
  );
}
