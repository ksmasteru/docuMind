# Getting SSH access to the server

You get the email and password of the company's **Atlas customer panel**. From the panel you
put your SSH key on the server once. After that you log in from your Mac with the key, with no
password.

Do this before [SERVER_SETUP.md](SERVER_SETUP.md).

**That panel account controls the server and the billing.** Never click Reinstall, Rebuild,
Delete or Reset unless the company asks you to: reinstalling wipes the server. Do not write
the panel login in any file in this repo.

## 1. Make a key (on your Mac)

```sh
ssh-keygen -t ed25519 -f ~/.ssh/atlas_vps -C "atlas-vps"
```

Pick a passphrase when asked. It protects the key file on your Mac. It is not a server
password.

This makes `~/.ssh/atlas_vps` (private: never leaves your Mac) and `~/.ssh/atlas_vps.pub`
(public: safe to share).

## 2. Find the server in the panel

Log in to the panel and open the VPS. Write down:

- the **IP address**
- the **OS** (Ubuntu, Debian, AlmaLinux...)
- the **root password**: it is usually on the server's page, or in the email Atlas sent to the
  company address when the VPS was created

Also find the **Console** button (it can be called VNC or KVM). It opens the server's screen in
the browser, and it works even when SSH does not.

Some panels have an "SSH keys" page. Do not rely on it: those keys are usually only copied to
the server when it is reinstalled.

## 3. Put your key on the server

Try A first. Use B if A fails or you have no root password.

### A. With the root password, from your Mac

```sh
ssh-copy-id -i ~/.ssh/atlas_vps.pub root@SERVER_IP
```

Type `yes` at the fingerprint question, then the root password. If it says
`Permission denied` with the right password, the server refuses password logins: use B.

### B. From the panel's web console

1. Open the console and log in as `root`. If you have no root password, the panel has a
   reset-password button, but **ask the company first**: it may reboot the server, and anyone
   using the old password is locked out.
2. Web consoles often cannot paste, and typing a whole key by hand is easy to get wrong. So
   put the key on GitHub first, where the server can download it. On your Mac:

   ```sh
   pbcopy < ~/.ssh/atlas_vps.pub
   ```

   On GitHub: your profile → Settings → SSH and GPG keys → New SSH key, paste, save.
3. In the console, type:

   ```sh
   mkdir -p ~/.ssh && chmod 700 ~/.ssh
   curl -fsSL https://github.com/ksmasteru.keys >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

   This adds every public key on your GitHub account. They are all yours, so that is fine.

The console may use a different keyboard layout from yours (QWERTY vs AZERTY): check that
`~ / > |` came out right before pressing Enter.

## 4. Add a shortcut (on your Mac)

```sh
touch ~/.ssh/config && chmod 600 ~/.ssh/config
```

Add this to `~/.ssh/config` (change the port if the panel shows one that is not 22):

```
Host atlas
    HostName SERVER_IP
    User root
    Port 22
    IdentityFile ~/.ssh/atlas_vps
    IdentitiesOnly yes
    AddKeysToAgent yes
    UseKeychain yes
```

`UseKeychain` keeps your key's passphrase in the macOS Keychain, so you type it only once.
Do not put `#` comments at the end of these lines: ssh reads them as part of the value.

## 5. Test

```sh
ssh atlas
```

It should log you in without the root password.

| What you see | Why |
| --- | --- |
| `Permission denied (publickey)` | The key is not in `/root/.ssh/authorized_keys`, or that file's rights are wrong: redo step 3 B from the console |
| Waits, then `Operation timed out` | Wrong port, or a firewall in the panel blocks SSH |
| Anything else | Run `ssh -v atlas` and read the last lines |

## 6. Turn off password login (optional, recommended)

Once step 5 works, stop people from guessing the root password. On the server, in
`/etc/ssh/sshd_config`:

```
PasswordAuthentication no
```

Also look in `/etc/ssh/sshd_config.d/`: a file there (often `50-cloud-init.conf`) that says
`PasswordAuthentication yes` wins over `sshd_config`. Then:

```sh
systemctl restart ssh            # AlmaLinux/CentOS: systemctl restart sshd
```

**Keep this session open and log in from a second terminal before closing it.** If the new
login fails, fix it from the open session. The web console always works as a way back in.

## 7. If you lose the key or your Mac

Log in through the web console and delete your line from `/root/.ssh/authorized_keys`: it
starts with the same `ssh-ed25519 AAAA...` as your `~/.ssh/atlas_vps.pub`. Also delete the key
from GitHub (step 3 B). Then start again at step 1.

## 8. Let the server pull from GitHub

[SERVER_SETUP.md](SERVER_SETUP.md) step 2 clones with `git@github.com:...`, so the server
needs its own key that GitHub accepts. Use a deploy key: it can only read this one repo.

On the server:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -C "documind-server" -N ""
cat ~/.ssh/github_deploy.pub
```

On GitHub: the docuMind repo → Settings → Deploy keys → Add deploy key. Paste the key and
leave "Allow write access" off.

Back on the server, add to `~/.ssh/config`:

```
Host github.com
    IdentityFile ~/.ssh/github_deploy
    IdentitiesOnly yes
```

Check it with `ssh -T git@github.com`: it should greet you with the repo name. Then go on with
[SERVER_SETUP.md](SERVER_SETUP.md).
