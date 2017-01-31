import mongodb from 'mongodb';
import Mongo from './index';

let mongo;
let db;
const user = {
  username: 'johndoe',
  email: 'john@doe.com',
  password: 'toto',
  profile: {},
};
const session = {
  userId: '123',
  ip: '127.0.0.1',
  userAgent: 'user agent',
};

function createConnection(cb) {
  const url = 'mongodb://localhost:27017/accounts-mongo-tests';
  mongodb.MongoClient.connect(url, (err, dbArg) => {
    db = dbArg;
    mongo = new Mongo(db);
    cb(err);
  });
}

function dropDatabase(cb) {
  db.dropDatabase((err) => {
    if (err) return cb(err);
    return cb();
  });
}

function closeConnection(cb) {
  dropDatabase((err) => {
    db.close();
    if (err) return cb(err);
    return cb();
  });
}

function delay(time) {
  return new Promise(resolve => setTimeout(() => resolve(), time));
}

describe('Mongo', () => {
  beforeAll(createConnection);

  describe('#constructor', () => {
    it('should have default options', () => {
      expect(mongo.options).toBeTruthy();
    });

    it('should overwrite options', () => {
      const mongoTestOptions = new Mongo(db, {
        collectionName: 'users-test',
        sessionCollectionName: 'sessions-test',
      });
      expect(mongoTestOptions.options).toBeTruthy();
      expect(mongoTestOptions.options.collectionName).toEqual('users-test');
      expect(mongoTestOptions.options.sessionCollectionName).toEqual('sessions-test');
    });

    it('should throw with an invalid database connection object', () => {
      try {
        new Mongo(); // eslint-disable-line no-new
        throw new Error();
      } catch (err) {
        expect(err.message).toBe('A valid database connection object is required');
      }
    });
  });

  describe('setupIndexes', () => {
    it('should create indexes', async () => {
      await mongo.setupIndexes();
      const ret = await mongo.collection.indexInformation();
      expect(ret).toBeTruthy();
      expect(ret._id_[0]).toEqual(['_id', 1]); // eslint-disable-line no-underscore-dangle
      expect(ret.username_1[0]).toEqual(['username', 1]);
      expect(ret['emails.address_1'][0]).toEqual(['emails.address', 1]);
    });

    afterAll((done) => {
      dropDatabase(done);
    });
  });

  describe('createUser', () => {
    it('should create a new user', async () => {
      const userId = await mongo.createUser(user);
      const ret = await mongo.findUserById(userId);
      expect(ret._id).toBeTruthy();
      expect(ret.emails[0].address).toBe(user.email);
      expect(ret.emails[0].verified).toBe(false);
      expect(ret.createdAt).toBeTruthy();
      expect(ret.updatedAt).toBeTruthy();
    });

    it('should not set password', async () => {
      const userId = await mongo.createUser({ email: user.email });
      const ret = await mongo.findUserById(userId);
      expect(ret._id).toBeTruthy();
      expect(ret.services.password).not.toBeTruthy();
    });

    it('should not set username', async () => {
      const userId = await mongo.createUser({ email: user.email });
      const ret = await mongo.findUserById(userId);
      expect(ret._id).toBeTruthy();
      expect(ret.username).not.toBeTruthy();
    });

    it('should not set email', async () => {
      const userId = await mongo.createUser({ username: user.username });
      const ret = await mongo.findUserById(userId);
      expect(ret._id).toBeTruthy();
      expect(ret.emails).not.toBeTruthy();
    });

    it('email should be lowercase', async () => {
      const userId = await mongo.createUser({ email: 'JohN@doe.com' });
      const ret = await mongo.findUserById(userId);
      expect(ret._id).toBeTruthy();
      expect(ret.emails[0].address).toEqual('john@doe.com');
    });
  });

  describe('findUserById', () => {
    it('should return null for not found user', async () => {
      const ret = await mongo.findUserById('unknowuser');
      expect(ret).not.toBeTruthy();
    });

    it('should return user', async () => {
      const userId = await mongo.createUser(user);
      const ret = await mongo.findUserById(userId);
      expect(ret).toBeTruthy();
    });
  });

  describe('findUserByEmail', () => {
    it('should return null for not found user', async () => {
      const ret = await mongo.findUserByEmail('unknow@user.com');
      expect(ret).not.toBeTruthy();
    });

    it('should return user', async () => {
      const ret = await mongo.findUserByEmail(user.email);
      expect(ret).toBeTruthy();
    });

    it('should return user with uppercase email', async () => {
      await mongo.createUser({ email: 'JOHN@DOES.COM' });
      const ret = await mongo.findUserByEmail('JOHN@DOES.COM');
      expect(ret._id).toBeTruthy();
      expect(ret.emails[0].address).toEqual('john@does.com');
    });
  });

  describe('findUserByUsername', () => {
    it('should return null for not found user', async () => {
      const ret = await mongo.findUserByUsername('unknowuser');
      expect(ret).not.toBeTruthy();
    });

    it('should return user', async () => {
      const ret = await mongo.findUserByUsername(user.username);
      expect(ret).toBeTruthy();
    });
  });

  describe('findPasswordHash', () => {
    it('should return null on not found user', async () => {
      const ret = await mongo.findPasswordHash('unknowuser');
      expect(ret).toEqual(null);
    });

    it('should return hash', async () => {
      const userId = await mongo.createUser(user);
      const retUser = await mongo.findUserById(userId);
      const ret = await mongo.findPasswordHash(userId);
      expect(ret).toBeTruthy();
      expect(ret).toEqual(retUser.services.password.bcrypt);
    });
  });

  describe('addEmail', () => {
    it('should throw if user is not found', async () => {
      try {
        await mongo.addEmail('unknowuser', 'unknowemail');
        throw new Error();
      } catch (err) {
        expect(err.message).toEqual('User not found');
      }
    });

    it('should add email', async () => {
      const email = 'johns@doe.com';
      const userId = await mongo.createUser(user);
      await delay(10);
      await mongo.addEmail(userId, email, false);
      const retUser = await mongo.findUserByEmail(email);
      expect(retUser.emails.length).toEqual(2);
      expect(retUser.createdAt).not.toEqual(retUser.updatedAt);
    });

    it('should add lowercase email', async () => {
      const email = 'johnS@doe.com';
      const userId = await mongo.createUser(user);
      await mongo.addEmail(userId, email, false);
      const retUser = await mongo.findUserByEmail(email);
      expect(retUser.emails.length).toEqual(2);
      expect(retUser.emails[1].address).toEqual('johns@doe.com');
    });
  });

  describe('removeEmail', () => {
    it('should throw if user is not found', async () => {
      try {
        await mongo.removeEmail('unknowuser', 'unknowemail');
        throw new Error();
      } catch (err) {
        expect(err.message).toEqual('User not found');
      }
    });

    it('should remove email', async () => {
      const email = 'johns@doe.com';
      const userId = await mongo.createUser(user);
      await delay(10);
      await mongo.addEmail(userId, email, false);
      await mongo.removeEmail(userId, user.email, false);
      const retUser = await mongo.findUserById(userId);
      expect(retUser.emails.length).toEqual(1);
      expect(retUser.emails[0].address).toEqual(email);
      expect(retUser.createdAt).not.toEqual(retUser.updatedAt);
    });

    it('should remove uppercase email', async () => {
      const email = 'johns@doe.com';
      const userId = await mongo.createUser(user);
      await mongo.addEmail(userId, email, false);
      await mongo.removeEmail(userId, 'JOHN@doe.com', false);
      const retUser = await mongo.findUserById(userId);
      expect(retUser.emails.length).toEqual(1);
      expect(retUser.emails[0].address).toEqual(email);
    });
  });

  describe('setUsername', () => {
    it('should throw if user is not found', async () => {
      try {
        await mongo.setUsername('unknowuser');
        throw new Error();
      } catch (err) {
        expect(err.message).toEqual('User not found');
      }
    });

    it('should change username', async () => {
      const username = 'johnsdoe';
      const userId = await mongo.createUser(user);
      await delay(10);
      await mongo.setUsername(userId, username);
      const retUser = await mongo.findUserById(userId);
      expect(retUser.username).toEqual(username);
      expect(retUser.createdAt).not.toEqual(retUser.updatedAt);
    });
  });

  describe('setPasssword', () => {
    it('should throw if user is not found', async () => {
      try {
        await mongo.setPasssword('unknowuser', 'toto');
        throw new Error();
      } catch (err) {
        expect(err.message).toEqual('User not found');
      }
    });

    it('should change password', async () => {
      const newPassword = 'newpass';
      const userId = await mongo.createUser(user);
      await delay(10);
      await mongo.setPasssword(userId, newPassword);
      const retUser = await mongo.findUserById(userId);
      expect(retUser.services.password.bcrypt).toBeTruthy();
      expect(retUser.services.password.bcrypt).not.toEqual(newPassword);
      expect(retUser.createdAt).not.toEqual(retUser.updatedAt);
    });
  });

  describe('setProfile', () => {
    it('should throw if user is not found', async () => {
      try {
        await mongo.setProfile('unknowuser', {});
        throw new Error();
      } catch (err) {
        expect(err.message).toEqual('User not found');
      }
    });

    it('should change profile', async () => {
      const userId = await mongo.createUser(user);
      await delay(10);
      const retUser = await mongo.setProfile(userId, { username: 'toto' });
      expect(retUser.username).toEqual('toto');
    });
  });

  describe('createSession', () => {
    it('should create session', async () => {
      const sessionId = await mongo.createSession(session.userId, session.ip, session.userAgent);
      const ret = await mongo.findSessionById(sessionId);
      expect(ret).toBeTruthy();
      expect(ret._id).toBeTruthy();
      expect(ret.userId).toEqual(session.userId);
      expect(ret.ip).toEqual(session.ip);
      expect(ret.userAgent).toEqual(session.userAgent);
      expect(ret.valid).toEqual(true);
      expect(ret.createdAt).toBeTruthy();
      expect(ret.updatedAt).toBeTruthy();
    });
  });

  describe('findSessionById', () => {
    it('should return null for not found session', async () => {
      const ret = await mongo.findSessionById('unknowsession');
      expect(ret).not.toBeTruthy();
    });

    it('should find session', async () => {
      const sessionId = await mongo.createSession(session);
      const ret = await mongo.findSessionById(sessionId);
      expect(ret).toBeTruthy();
    });
  });

  describe('updateSession', () => {
    it('should update session', async () => {
      const sessionId = await mongo.createSession(session.userId, session.ip, session.userAgent);
      await delay(10);
      await mongo.updateSession(sessionId, 'new ip', 'new user agent');
      const ret = await mongo.findSessionById(sessionId);
      expect(ret.userId).toEqual(session.userId);
      expect(ret.ip).toEqual('new ip');
      expect(ret.userAgent).toEqual('new user agent');
      expect(ret.valid).toEqual(true);
      expect(ret.createdAt).toBeTruthy();
      expect(ret.updatedAt).toBeTruthy();
      expect(ret.createdAt).not.toEqual(ret.updatedAt);
    });
  });

  describe('invalidateSession', () => {
    it('invalidates a session', async () => {
      const sessionId = await mongo.createSession(session.userId, session.ip, session.userAgent);
      await delay(10);
      await mongo.invalidateSession(sessionId);
      const ret = await mongo.findSessionById(sessionId);
      expect(ret.valid).toEqual(false);
      expect(ret.createdAt).not.toEqual(ret.updatedAt);
    });
  });

  afterAll(closeConnection);
});
