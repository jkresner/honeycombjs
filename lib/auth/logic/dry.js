function setProfileTokens(profile, token, refresh) {
  var {appKey} = config.auth
  _.set(profile,`tokens.${appKey}.token`, token)
  if (refresh) _.set(profile,`tokens.${appKey}.refresh`, refresh)
  return profile
}


function STS() {
  let cfg = honey.cfg('auth.token')||{}
  if (!cfg.jwt) return 

  return this.sts || require('../token/sts')()
}


module.exports = ({User}, Data, {logAct}) => ({

  sts: new STS(),

  linkOAuth(ctx, key, provider, profile, tokens, done) {
    var {user,existing} = ctx
    LOG('auth.oauth', `oauth:${key}.link`, `[${user._id}] ${user.name}: ${JSON.stringify(profile)}`)

    //-- At this point we only take care of user.auth
    //-- But at some point we should get all the logic going
    //-- for emails + photos etc.
    var {auth} = this.mergeOAuth(user, key, provider, profile, tokens)
    User.updateSet(user._id, {auth}, (e, user) => {
      done(e, user)
      if (!e) TRACK(`auth.link:oauth.${key}`, ctx, {user,provider,profile})
    })
  },


  login(sessionID, session, login, {auth, emails, photos}, done) {
    let update = { auth, emails, photos }

    // update.cohort = this.getCohortProps(login, session)

    // let aliases = config.auth.appKey == 'apcom' ? [sessionID] : []
    // update.cohort.aliases = _.union(update.cohort.aliases||[],aliases)
    update.log = logAct(login, 'login', login)

    User.updateSet(login._id, update, (e, r) => {
      done(e, r)
      if (!e) LOG('auth.login', 'login', `[${r._id}] ${r.name}`)
    })

  },


  loginLocal(ctx, existing, done) {
    var {sessionID, session} = ctx
    var updates = existing
    LOG('auth.local', `local:pwd.login`, `[${existing._id}] ${existing.name}`)
    this.login(sessionID, session, existing, updates, (e, login) => {
      done(e, login)
      if (!e) TRACK(`auth.login:local.pwd`, assign({analytics:{alias:login}},ctx), {login})
    })
  },


  loginOAuth(ctx, key, provider, profile, tokens, done) {
    let {existing, sessionID, session} = ctx
    let updates = this.mergeOAuth(existing, key, provider, profile, tokens)
    LOG('auth.oauth', `oauth:${key}.login`, `[${existing._id}] ${profile.id} ${profile.login||profile.username||profile.displayName||profile.name}`)
    this.login(sessionID, session, existing, updates, (e, login) => {
      done(e, login)
      if (!e) TRACK(`auth.login:oauth.${key}`, assign({analytics:{alias:login}},ctx), {login})
    })
  },


  mergeOAuthEmails(existing, oauthEmails) {
    var {emails} = existing
    if (!emails) emails = oauthEmails
    else {
      for (var oauthEmail of oauthEmails)
        if (!_.find(emails, o=>o.value==oauthEmail.value)) emails.push(oauthEmail)
    }
    return emails
  },


  mergeOAuthPhotos(existing, oauthPhotos) {
    var {photos} = existing
    if (!photos) photos = oauthPhotos
    else {
      for (var oauthPhoto of oauthPhotos)
        if (!_.find(photos, o=>o.value==oauthPhoto.value)) photos.push(oauthPhoto)
    }
    return photos
  },


  mergeOAuth(existing, key, provider, profile, {token,refresh}) {
    var {Project} = Data.auth
    if (Project.emails[key])
      var emails = this.mergeOAuthEmails(existing, Project.emails[key](profile,existing))

    if (Project.photos[key])
      var photos = this.mergeOAuthPhotos(existing, Project.photos[key](profile,existing))

    var auth = existing ? existing.auth : {}
    var mergedProfile = _.extend(_.get(existing||{},`auth.${key}`)||{},profile)
    auth[key] = setProfileTokens(mergedProfile,token,refresh)

    return {emails,photos,auth}
  },


  signup(type, sessionID, session, signup, done) {
    signup.log = logAct(null, 'signup', signup)

    User.create(signup, (e, user) => {
      done(e, user)
      if (!e) LOG('auth.signup', `signup`, `${JSON.stringify(user)}`)
    })
  },


// /localSignup(email, password, name, done) {
//   if (this.user) return done(Error(`Signup fail. Already logged in as ${this.user.name}`))

//   User.getManyByQuery(query.existing.byEmails([email]), (e, existing) => {
//     if (e) return done(e)
//     if (existing.length == 1) return done(Error(`Signup fail. Account with email already exists. Please reset your password.`))
//     if (existing.length > 1) return done(Error(`Signup fail. Multiple user accounts associated with ${email}. Please contact team@airpair.com to merge your accounts.`))

//     var user    = {name}
//     user.emails = [{value:email,primary:true,verified:false}]
//     user.auth   = {
//       password:   { hash: select.passwordHash(password) } // password is hased in the db
//     }

//     if (logging) $log('Auth.localSignup', this.sessionID, user.name)
//     _createUser(this.sessionID, this.session, user, done)
//   })
// }


  signupOAuth(ctx, key, provider, profile, {token,refresh}, done) {
    let {Project} = Data.auth
    let user = Project.odata[key](profile)
    user._id = User.newId()  // So touch and analytics works
    user.auth = {}
    user.auth[key] = setProfileTokens(profile, token, refresh)
    LOG('auth.oauth', `oauth:${key}.signup`, `[${user._id}] ${profile.id} ${profile.login||profile.username||profile.displayName||profile.name}`)
    this.signup(`oauth:${key}`, ctx.sessionID, ctx.session, user, (e, signup) => {
      done(e, signup)
      if (!e) TRACK(`auth.signup:oauth.${key}`, assign({analytics:{alias:signup}},ctx), {signup})
    })
  },


  userByAuth(user, key, data, cb) {
    let {Query,Opts} = Data.auth

    let idx = key
    if (key.indexOf('password') == 0) idx = 'byEmails'
    else if (key.length > 2) idx = honey.cfg('auth.oauth')[key].short

    if (!Query.existing[idx])
      throw Error(`getByAuth fail: Exising query for User.auth.${key} not defined`)

    let query = Query.existing[idx](data)
    if (user) {
      for (var prop in query)
        if (_.get(user,prop) === query[prop])
          return cb(null, user)
    }

    User.getByQuery(query, Opts[key]||{}, cb)
  }


})
