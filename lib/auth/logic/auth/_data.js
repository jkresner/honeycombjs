const Views = {
  session:   config.middleware.session.authdData,
  login:     'name linked emails photos log cohort'
}

function newId() {
  return honey.projector._.id.new()
}

var Query = {

  existing: {
    byEmails(emails) {
      emails = emails.filter(em => !!em.toLowerCase)
                     .map(em => em.toLowerCase())

      return { '$or': emails.length == 0 ? [] : [
        { 'email' : { $in: emails } },
        { 'emails.value' : { $in: emails } },
        { 'auth.gp.emails.value' : { $in: emails } },
        { 'auth.gp.email' : { $in: emails } },
        { 'auth.fb.email' : { $in: emails } },
        { 'auth.gh.emails.email' : { $in: emails } }
      ]}
    },
    gp(profile) {
      var emails = _.map(profile.emails||[], 'value')
      if (emails.length == 0) {
        if (!profile.email) throw Error("Google profile has no email")
        else emails = [profile.email.toLowerCase()]
      }
      var q = Query.existing.byEmails(emails)
      q['$or'].push({'auth.gp.id':profile.id})
      return q
    },
    gh(profile) {
      var emails = _.map(profile.emails||[], 'email')
      var q = emails.length > 0 ? Query.existing.byEmails(emails) : { '$or': [] }
      q['$or'].push({'auth.gh.id':profile.id})
      return q
    },
    fb(profile) {
      var emails = [profile.email]
      var q = Query.existing.byEmails(emails)
      q['$or'].push({'auth.fb.id':profile.id})
      return q
    },
    al: profile => ({'auth.al.id':profile.id}),
    bb: profile => ({'auth.bb.user.username':profile.user.username}),
    in: profile => ({'auth.in.id':profile.id}),
    sl: profile => ({'auth.sl.id':profile.id}),
    so: profile => ({'auth.so.user_id':profile.user_id}),
    tw: profile => ({'auth.tw.id':profile.id}),
  }

}


var primaryEmail = u =>
  (u||{}).emails ? _.find(u.emails, o => o.primary) : undefined
var primaryPhoto = u =>
  (u||{}).photos ? _.find(u.photos, o => o.primary) : undefined

var project = {
  emails: {
    gh(profile, existingUser) {
      var existingPrimary = primaryEmail(existingUser)
      return (profile.emails||[]).map(o => ({
        _id:        newId(),
        primary:    !existingPrimary && o.primary,
        value:      o.email,
        verified:   o.verified,
        origin:     'oauth:github'  }))
    },
    fb(profile, existingUser) {
      var existingPrimary = primaryEmail(existingUser)
      return [{
        _id:        newId(),
        primary:    !existingPrimary,
        value:      profile.email,
        verified:   true,
        origin:     'oauth:facebook'  }]
    }
  },
  photos: {
    gh(profile, existingUser) {
      var existingPrimary = primaryPhoto(existingUser)
      var photos = [{ value:profile.avatar_url, type:'github',
                      primary:!existingPrimary && !profile.gravatar_id }]
      if (profile.gravatar_id && profile.gravatar_id != '')
        photos.push({ value:profile.gravatar_id, type:'gravatar',
                      primary:!existingPrimary })
      return photos
    },
    gp(profile, existingUser) {
      let existingPrimary = primaryPhoto(existingUser)
      return [{ value:profile.image.url, type:'gplus',
                      primary:!existingPrimary }]
    },
    fb(profile, existingUser) {
      var existingPrimary = primaryPhoto(existingUser)
      return [{ value:profile.picture.data.url, type:'facebook',
                      primary:!existingPrimary }]
    }
  }
}

const Projections = ({select},{view}) => ({

  emails: project.emails,
  photos: project.photos,

  minimal: {
    al: p => `${p.id} ${p.angellist_url}`,
    bb: p => `${p.id} ${p.user.username}`,
    fb: p => `${p.id} ${p.name}`,
    gh: p => `${p.id} ${p.login}`,
    gp: p => `${p.id} ${p.displayName}`,
    in: p => `${p.id} ${p.firstName} ${p.lastName}`,
    // sl: p => `${p.id} ${p.displayName}`,
    so: p => `${p.user_id} ${p.display_name}`,
    tw: p => `${p.id} ${p.screen_name}`,
  },
  odata: {
    gp(p, user) {
      $log('gp.profile.p'.magenata, p)
      let name = p.displayName
      let photos = project.photos.gp(p, user)
      let emails = p.emails //todo project.emails.gp(p, user)
      emails[0].primary = true
      emails[0].verified = true
      return {name,emails,photos}
    },
    fb(p, user) {
      var {name,id} = p
      var emails = project.emails.fb(p, user)
      var photos = project.photos.fb(p, user)
      return {name,id,emails,photos}
    },
    al(p) {
      var username = p.angellist_url.replace('https://angel.co/','')
      return {profile: assign({username}, _.omit(p,'facebook_url','behance_url','dribbble_url')) }
    },
    sl(p) {
      var username = p.info.user.name
      var selected = select(p.info.user, 'id real_name tz_offset profile.email')
      return { profile: assign({username},selected), primary: true }
    },
    gh(p, user) {
      var name = p.name || p.login
      var emails = project.emails.gh(p, user)
      var photos = project.photos.gh(p, user)

      // var email = user ? user.email : (_.find(p.emails, o => o.primary && o.verified)||{}).email
      // var emailVerified = email ? true : false

      var username = p.login
      return {name,emails,photos,username}
    },
    tw(p) { return {profile:p} },
    in(p) { return {profile:p} },
    bb(p) { return {profile:p} },
    so(p) { return {profile:p} },
  },


  avatar: d => assign(d, {avatar:(primaryPhoto(d)||{}).value}),

  session(d) {
    d.avatar = (primaryPhoto(d)||{}).value
    email = (primaryEmail(d)||{}).value
    if (email) d.email = email
    // $log('auth._data.session'.cyan, view.session(d))
    return view.session(d)
  },

  comm(d) {
    var r = view.session(d)
    email = (primaryEmail(d)||{}).value
    if (email) r.email = email
    r.avatar = r.avatar || (primaryPhoto(d)||{}).value
    return r
  }

})

const Opts = {
  password_login: { select:'_id name photos emails auth.password log'}
}

module.exports = {Views,Query,Opts,Projections}
