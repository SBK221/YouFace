import {initializeApp} from 'firebase/app';
import {getAuth,onAuthStateChanged,GoogleAuthProvider,signInWithPopup,createUserWithEmailAndPassword,signInWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,signOut,deleteUser,reauthenticateWithPopup,reauthenticateWithCredential,EmailAuthProvider} from 'firebase/auth';
import {getFirestore,doc,getDoc,setDoc,updateDoc,deleteDoc,collection,collectionGroup,query,where,orderBy,limit,startAfter,getDocs,addDoc,serverTimestamp,writeBatch} from 'firebase/firestore';
const $=s=>document.querySelector(s);
const config=window.YOUFACE_FIREBASE||{};
const ready=Boolean(config.apiKey&&config.projectId&&config.appId);
let auth,db,user,profile,cursor,busy=false,epoch=0;
const blocks=new Set();
const say=text=>{$('#notice').textContent=text;};
const errors={
 'auth/invalid-credential':'E-mail ou mot de passe incorrect.',
 'auth/email-already-in-use':'Cet e-mail est déjà utilisé.',
 'auth/popup-closed-by-user':'Connexion annulée.',
 'auth/requires-recent-login':'Reconnecte-toi pour confirmer la suppression.',
 'permission-denied':'Action refusée. Vérifie la connexion et les règles Firebase.',
 'resource-exhausted':'La limite gratuite est atteinte. Réessaie plus tard ; aucun paiement ne sera déclenché.',
 'auth/too-many-requests':'Trop de tentatives. Réessaie plus tard.'
};
function error(e){console.error(e.code||e.message);say(errors[e.code]||'L’action n’a pas abouti. Réessaie ; si le problème continue, contacte l’assistance.');}
function member(){if(!user||!user.emailVerified||profile?.status!=='active')throw new Error('ACCOUNT_UNAVAILABLE');}
async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){error(e);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=!ready);}}
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function button(text,fn){const b=el('button',text,'secondary');b.type='button';b.onclick=()=>run(fn);return b;}
function accept(){if(!$('#terms').checked)throw new Error('TERMS_REQUIRED');}
async function ensureProfile(){
 const snap=await getDoc(doc(db,'users',user.uid));
 if(snap.exists())return snap.data();
 if(!$('#terms').checked){say('Accepte les conditions pour créer ton profil.');return null;}
 const name=(user.displayName||'Membre YouFace').slice(0,80);
 const data={displayName:name,status:'active',termsVersion:'2026-11-14',acceptedAt:serverTimestamp()};
 await setDoc(doc(db,'users',user.uid),data);return data;
}
async function loadBlocks(){blocks.clear();$('#blocks').replaceChildren();if(!user)return;
 const docs=await getDocs(query(collection(db,'users',user.uid,'blocks'),limit(25)));
 docs.forEach(d=>{blocks.add(d.id);$('#blocks').append(button('Ne plus masquer ce créateur',async()=>{await deleteDoc(d.ref);await loadBlocks();await feed(true);}));});
 if(docs.empty)$('#blocks').textContent='Aucun créateur masqué.';
}
async function feed(reset=true){if(!ready)return;const token=epoch;if(reset){cursor=null;$('#feed').replaceChildren();}
 const constraints=[where('status','==','published'),orderBy('createdAt','desc'),limit(20)];if(cursor)constraints.push(startAfter(cursor));
 const result=await getDocs(query(collection(db,'posts'),...constraints));if(token!==epoch)return;
 result.forEach(d=>{if(!blocks.has(d.data().authorId))$('#feed').append(postCard(d));});cursor=result.docs.at(-1)||cursor;$('#more').hidden=result.size<20;
 if(reset&&result.empty)$('#feed').append(el('p','Pas encore de publication. Partage la première idée !'));
}
function postCard(snapshot){const data=snapshot.data(),card=el('article',undefined,'card');
 const head=el('div',undefined,'post-head');head.append(el('strong',data.authorName||'Membre'),el('span',data.createdAt?.toDate().toLocaleDateString('fr-CA')||''));
 card.append(head,el('p',data.body,'post-body'));
 if(!user||profile?.status!=='active')return card;
 const actions=el('div',undefined,'post-actions');
 actions.append(button('J’aime',async()=>{const ref=doc(db,'posts',snapshot.id,'likes',user.uid);const own=await getDoc(ref);if(own.exists()){await deleteDoc(ref);say('Mention J’aime retirée.');}else{await setDoc(ref,{userId:user.uid});say('Merci pour ton soutien !');}}));
 actions.append(button('Commentaires',async()=>{let box=card.querySelector('.comments');if(box){box.remove();return;}box=el('div',undefined,'comments');card.append(box);
  const comments=await getDocs(query(collection(db,'posts',snapshot.id,'comments'),orderBy('createdAt','desc'),limit(20)));
  comments.forEach(c=>{const v=c.data(),row=el('p',`${v.authorName} : ${v.body}`);if(v.authorId===user.uid)row.append(button('Supprimer',async()=>{await deleteDoc(c.ref);row.remove();}));box.append(row);});
  const form=el('form'),input=el('input');input.placeholder='Ton commentaire';input.required=true;input.maxLength=1000;input.setAttribute('aria-label','Commentaire');const send=el('button','Envoyer');form.append(input,send);form.onsubmit=e=>{e.preventDefault();run(async()=>{member();await addDoc(collection(db,'posts',snapshot.id,'comments'),{authorId:user.uid,authorName:profile.displayName,body:input.value.trim(),createdAt:serverTimestamp()});box.append(el('p',`${profile.displayName} : ${input.value.trim()}`));input.value='';});};box.append(form);
 }));
 if(data.authorId===user.uid)actions.append(button('Supprimer la publication',async()=>{if(!confirm('Supprimer cette publication et ses commentaires ?'))return;await removePost(snapshot);card.remove();}));
 else{actions.append(button('Signaler',async()=>{const reason=prompt('Pourquoi signales-tu cette publication ?');if(!reason?.trim())return;await addDoc(collection(db,'reports'),{reporterId:user.uid,postId:snapshot.id,reason:reason.trim().slice(0,1000),createdAt:serverTimestamp()});say('Signalement transmis au responsable de YouFace.');}));actions.append(button('Masquer ce créateur',async()=>{await setDoc(doc(db,'users',user.uid,'blocks',data.authorId),{createdAt:serverTimestamp()});await loadBlocks();await feed(true);}));}
 card.append(actions);return card;
}
async function erase(q){let count=0;while(true){const snaps=await getDocs(q);if(snaps.empty)return count;const batch=writeBatch(db);snaps.forEach(s=>batch.delete(s.ref));await batch.commit();count+=snaps.size;}}
async function removePost(post){await updateDoc(post.ref,{status:'deleting'});await erase(query(collection(post.ref,'comments'),limit(25)));await erase(query(collection(post.ref,'likes'),limit(25)));await deleteDoc(post.ref);}
async function all(q){const rows=[];let last;while(true){const page=await getDocs(last?query(q,startAfter(last)):q);page.forEach(s=>rows.push({id:s.id,path:s.ref.path,...s.data()}));if(page.size<25)return rows;last=page.docs.at(-1);}}
async function exportData(){member();const uid=user.uid;const data={exportedAt:new Date().toISOString(),account:{email:user.email,profile},posts:await all(query(collection(db,'posts'),where('authorId','==',uid),limit(25))),comments:await all(query(collectionGroup(db,'comments'),where('authorId','==',uid),limit(25))),likes:await all(query(collectionGroup(db,'likes'),where('userId','==',uid),limit(25))),reports:await all(query(collection(db,'reports'),where('reporterId','==',uid),limit(25)))};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='youface-mes-donnees.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);say('Export téléchargé sur ton appareil.');}
async function deleteAccount(){const current=user,uid=current.uid;
 if(profile?.status==='active'){await updateDoc(doc(db,'users',uid),{status:'deleting'});profile.status='deleting';}
 if(profile?.status!=='deleted'){
  while(true){const posts=await getDocs(query(collection(db,'posts'),where('authorId','==',uid),limit(25)));if(posts.empty)break;for(const post of posts.docs)await removePost(post);}
  await erase(query(collectionGroup(db,'comments'),where('authorId','==',uid),limit(25)));
  await erase(query(collectionGroup(db,'likes'),where('userId','==',uid),limit(25)));
  await erase(query(collection(db,'reports'),where('reporterId','==',uid),limit(25)));
  await erase(query(collection(db,'users',uid,'blocks'),limit(25)));
  // A minimal marker prevents still-valid ID tokens from recreating the account.
  await setDoc(doc(db,'users',uid),{status:'deleted',deletedAt:serverTimestamp()});profile={status:'deleted'};
 }
 await deleteUser(current);say('Ton compte et tes contenus YouFace ont été supprimés.');$('#reauth').hidden=true;await feed(true);
}
$('#auth-form').onsubmit=e=>{e.preventDefault();run(async()=>{accept();const form=new FormData(e.target),email=String(form.get('email')).trim(),password=String(form.get('password'));if(e.submitter?.value==='register'){const result=await createUserWithEmailAndPassword(auth,email,password);await sendEmailVerification(result.user);say('Vérifie ton e-mail, puis reconnecte-toi.');}else await signInWithEmailAndPassword(auth,email,password);});};
$('#google').onclick=()=>run(async()=>{accept();await signInWithPopup(auth,new GoogleAuthProvider());});
$('#reset').onclick=()=>run(async()=>{const email=$('#auth-form input[name=email]').value.trim();if(!email){say('Saisis ton e-mail pour recevoir le lien de réinitialisation.');return;}await sendPasswordResetEmail(auth,email);say('Si ce compte existe, tu recevras un lien de réinitialisation.');});
$('#verify-email').onclick=()=>run(async()=>{if(auth.currentUser)await sendEmailVerification(auth.currentUser);say('E-mail de vérification envoyé.');});
$('#logout').onclick=()=>run(()=>signOut(auth));
$('#profile').onsubmit=e=>{e.preventDefault();run(async()=>{if(!profile){accept();profile=await ensureProfile();if(!profile)return;}member();const name=$('#display-name').value.trim();if(name.length<2)return;say('Enregistrement…');await updateDoc(doc(db,'users',user.uid),{displayName:name});profile.displayName=name;say('Profil enregistré.');});};
$('#publish').onsubmit=e=>{e.preventDefault();run(async()=>{member();const body=new FormData(e.target).get('body').trim();if(!body)return;await addDoc(collection(db,'posts'),{authorId:user.uid,authorName:profile.displayName,body,status:'published',createdAt:serverTimestamp()});e.target.reset();await feed(true);say('Publication partagée.');});};
$('#refresh').onclick=()=>run(()=>feed(true));$('#more').onclick=()=>run(()=>feed(false));$('#export').onclick=()=>run(exportData);
$('#delete-account').onclick=()=>{if(!confirm('La suppression est définitive : publications, commentaires et compte seront effacés. Continuer ?'))return;$('#reauth').hidden=false;$('#reauth-password').hidden=!user?.providerData.some(p=>p.providerId==='password');say('Confirme ton identité ci-dessous.');};
$('#reauth-confirm').onclick=()=>run(async()=>{if(!user)return;if(user.providerData.some(p=>p.providerId==='password'))await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,$('#reauth-password').value));else await reauthenticateWithPopup(user,new GoogleAuthProvider());$('#reauth-password').value='';say('Suppression en cours. Garde cette page ouverte.');await deleteAccount();});
if(!ready){document.querySelectorAll('button').forEach(b=>b.disabled=true);say('La connexion au projet Firebase doit encore être configurée. Aucun paiement n’est demandé.');}
else{const firebase=initializeApp(config);auth=getAuth(firebase);auth.useDeviceLanguage();db=getFirestore(firebase);
 onAuthStateChanged(auth,async next=>{epoch++;user=next;profile=null;$('#logout').hidden=!next;$('#member').hidden=!next?.emailVerified;$('#auth').hidden=Boolean(next?.emailVerified);$('#verify-email').hidden=!next||next.emailVerified;
  try{if(next?.emailVerified){profile=await ensureProfile();$('#display-name').value=profile?.displayName||'Membre YouFace';if(!profile){$('#auth').hidden=false;}else if(profile.status!=='active'){say('La suppression de ce compte est en cours. Confirme ton identité pour la terminer.');$('#publish').hidden=true;$('#profile').hidden=true;$('#reauth').hidden=false;$('#reauth-password').hidden=!user.providerData.some(p=>p.providerId==='password');}else{$('#publish').hidden=false;$('#profile').hidden=false;say('Bienvenue sur YouFace.');await loadBlocks();}}else if(next){say('Vérifie ton e-mail, puis déconnecte-toi et reconnecte-toi.');}await feed(true);}catch(e){error(e);}
 });
}
