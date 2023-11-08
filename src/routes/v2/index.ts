import express from 'express';
import auth from './auth';
import me from './me';
import contacts from './contacts';
import user from './user';
import send from './send';
import leaderboard from './leaderboard';
import config from './config';
import stats from './stats';
import balance from './balance';
import activity from './activity';
import userActivity from './userActivity';
import rewards from './rewards';
import swap from './swap';

const router = express.Router();

router.use('/auth', auth);
router.use('/me', me);
router.use('/contacts', contacts);
router.use('/user', user);
router.use('/send', send);
router.use('/leaderboard', leaderboard);
router.use('/config', config);
router.use('/stats', stats);
router.use('/balance', balance);
router.use('/activity', activity);
router.use('/userActivity', userActivity);
router.use('/rewards', rewards);
router.use('/swap', swap);

export default router;
