# Quick-Red

A command-line tool for Infinia developers and testers.

Run it like this...

```
$ export RED_SERVER_IP=10.25.94.4   # will default to localhost if unspecified
$ ./quick-red.py login  # this will prompt for username and password
$ ./quick-red.py clusters
```

## Useful commands

```
# get help
./quick-red.py -h
```


## Environment variables

- RED_USER - will default to this user if specified
- RED_PASSWORD - will use this password if specified
- RED_SERVER_IP - specify the server IP address or FQDN; defaults to localhost
